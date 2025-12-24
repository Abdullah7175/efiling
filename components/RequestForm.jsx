"use client"

import React, { useEffect, useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useToast } from "@/hooks/use-toast";
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';

const Select = dynamic(() => import('react-select'), { ssr: false });

const validationSchema = Yup.object({
    town_id: Yup.string().required('Town is required'),
    subtown_id: Yup.string().nullable(),
    subtown_ids: Yup.array().of(Yup.number()),
    complaint_type_id: Yup.string().required('Complaint type is required'),
    complaint_subtype_id: Yup.string().nullable(),
    contact_number: Yup.string()
        .required('Contact number is required')
        .matches(/^[0-9]{10,15}$/, 'Must be a valid phone number'),
    address: Yup.string().required('Address is required'),
    description: Yup.string().required('Description is required'),
    latitude: Yup.number().nullable(),
    longitude: Yup.number().nullable(),
    budget_code: Yup.string().required('Budget code is required'),
    file_type: Yup.string().oneOf(['SPI', 'ADP']).required('File type is required'),
});

export const RequestForm = ({ isPublic = false, initialValues, onSubmit, isEditMode = false }) => {
    const { data: session } = useSession();
    const { toast } = useToast();
    const [towns, setTowns] = useState([]);
    const [subtowns, setSubtowns] = useState([]);
    const [filteredSubtowns, setFilteredSubtowns] = useState([]);
    const [selectedTown, setSelectedTown] = useState(null);
    const [complaintTypes, setComplaintTypes] = useState([]);
    const [complaintSubTypes, setComplaintSubTypes] = useState([]);
    const [filteredSubTypes, setFilteredSubTypes] = useState([]);
    const [selectedComplaintType, setSelectedComplaintType] = useState(null);
    const [locationAccess, setLocationAccess] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);

    const formik = useFormik({
        initialValues: initialValues || {
            town_id: '',
            subtown_id: '',
            subtown_ids: [],
            complaint_type_id: '',
            complaint_subtype_id: '',
            contact_number: '',
            address: '',
            description: '',
            latitude: null,
            longitude: null,
            budget_code: '',
            file_type: '',
            applicant_id: session?.user?.id || null,
        },
        validationSchema,
        validateOnChange: true,
        validateOnBlur: true,
        enableReinitialize: true,
        onSubmit: async (values) => {
            if (onSubmit) {
                await onSubmit(values);
            } else {
                try {
                    // Automatically add creator_id and creator_type from session if available
                    let creatorType = null;
                    if (session?.user?.userType === 'users') creatorType = 'user';
                    else if (session?.user?.userType === 'agents') creatorType = 'agent';
                    else if (session?.user?.userType === 'socialmediaperson') creatorType = 'socialmedia';
                    else creatorType = session?.user?.userType || null;
                    const payload = {
                        ...values,
                        creator_id: session?.user?.id || null,
                        creator_type: creatorType,
                    };
                    const response = await fetch('/api/requests', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(payload),
                    });

                    if (response.ok) {
                        toast({
                            title: "Request submitted successfully",
                            description: 'Your work request has been received.',
                            variant: 'success',
                        });
                        formik.resetForm();
                    } else {
                        toast({
                            title: "Failed to submit request",
                            description: 'Please try again later.',
                            variant: 'destructive',
                        });
                    }
                } catch (error) {
                    console.error('Error submitting form:', error);
                    toast({
                        title: "An error occurred",
                        description: 'Please try again later.',
                        variant: 'destructive',
                    });
                }
            }
        },
    });

    const getCurrentLocation = () => {
        setLocationLoading(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    formik.setFieldValue('latitude', position.coords.latitude);
                    formik.setFieldValue('longitude', position.coords.longitude);
                    setLocationAccess(true);
                    setLocationLoading(false);
                    toast({
                        title: "Location captured successfully",
                        variant: 'success',
                    });
                },
                (error) => {
                    console.error('Error getting location:', error);
                    setLocationLoading(false);
                    toast({
                        title: "Location access denied",
                        description: 'Please enter coordinates manually or try again.',
                        variant: 'destructive',
                    });
                }
            );
        } else {
            setLocationLoading(false);
            toast({
                title: "Geolocation not supported",
                description: 'Please enter coordinates manually.',
                variant: 'destructive',
            });
        }
    };

    useEffect(() => {
        // Fetch towns
        const fetchTowns = async () => {
            try {
                const res = await fetch('/api/complaints/getinfo');
                if (res.ok) {
                    const data = await res.json();
                    setTowns(data.towns);
                }
            } catch (error) {
                console.error('Error fetching towns:', error);
            }
        };

        // Fetch subtowns
        const fetchSubtowns = async () => {
            try {
                const res = await fetch('/api/towns/subtowns');
                if (res.ok) {
                    const data = await res.json();
                    setSubtowns(data);
                }
            } catch (error) {
                console.error('Error fetching subtowns:', error);
            }
        };

        // Fetch complaint types
        const fetchComplaintTypes = async () => {
            try {
                const res = await fetch('/api/complaints/getalltypes');
                if (res.ok) {
                    const data = await res.json();
                    setComplaintTypes(data);
                }
            } catch (error) {
                console.error('Error fetching complaint types:', error);
            }
        };

        // Fetch complaint subtypes
        const fetchComplaintSubTypes = async () => {
            try {
                const res = await fetch('/api/complaints/subtypes');
                if (res.ok) {
                    const data = await res.json();
                    setComplaintSubTypes(data);
                }
            } catch (error) {
                console.error('Error fetching Nature of work:', error);
            }
        };

        fetchTowns();
        fetchSubtowns();
        fetchComplaintTypes();
        fetchComplaintSubTypes();
    }, []);

    const handleTownChange = (selectedOption) => {
        setSelectedTown(selectedOption);
        const filtered = subtowns.filter(subtown => subtown.town_id === selectedOption.value);
        setFilteredSubtowns(filtered);
        formik.setFieldValue('town_id', selectedOption ? selectedOption.value : '');
        formik.setFieldValue('subtown_id', '');
    };

    const handleComplaintTypeChange = (selectedOption) => {
        setSelectedComplaintType(selectedOption);
        const filtered = complaintSubTypes.filter(subtype => subtype.complaint_type_id === selectedOption.value);
        setFilteredSubTypes(filtered);
        formik.setFieldValue('complaint_type_id', selectedOption ? selectedOption.value : '');
        formik.setFieldValue('complaint_subtype_id', '');
    };

    // Options for select components
    const townOptions = towns.map(town => ({
        value: town.id,
        label: town.town
    }));

    const subtownOptions = filteredSubtowns.map(subtown => ({
        value: subtown.id,
        label: subtown.subtown
    }));

    const complaintTypeOptions = complaintTypes.map(type => ({
        value: type.id,
        label: type.type_name
    }));

    const complaintSubTypeOptions = filteredSubTypes.map(type => ({
        value: type.id,
        label: type.subtype_name
    }));

    return (
        <div className="container mx-auto p-4">
            <form onSubmit={formik.handleSubmit} className="max-w-3xl mx-auto bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-2xl font-bold mb-6 text-gray-800">
                    {isPublic ? 'Submit Work Request' : 'Create New Work Request'}
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Town */}
                            <div>
                                <label htmlFor="town_id" className="block text-sm font-medium text-gray-700 mb-1">
                                    Town *
                                </label>
                                <Select
                                    id="town_id"
                                    name="town_id"
                                    options={townOptions}
                                    onChange={handleTownChange}
                                    value={townOptions.find(option => option.value === formik.values.town_id) || null}
                                    className="basic-select"
                                    classNamePrefix="select"
                                />
                                {formik.errors.town_id && formik.touched.town_id && (
                                    <p className="mt-1 text-sm text-red-600">{formik.errors.town_id}</p>
                                )}
                            </div>

                            {/* Sub Town */}
                            <div>
                                <label htmlFor="subtown_id" className="block text-sm font-medium text-gray-700 mb-1">
                                    Sub Town (Optional)
                                </label>
                                <Select
                                    id="subtown_id"
                                    name="subtown_id"
                                    options={subtownOptions}
                                    onChange={(selectedOption) => {
                                        formik.setFieldValue('subtown_id', selectedOption ? selectedOption.value : '');
                                    }}
                                    value={subtownOptions.find(option => option.value === formik.values.subtown_id) || null}
                                    className="basic-select"
                                    classNamePrefix="select"
                                    isDisabled={!selectedTown}
                                />
                            </div>

                            {/* Complaint Type */}
                            <div>
                                <label htmlFor="complaint_type_id" className="block text-sm font-medium text-gray-700 mb-1">
                                    Complaint Type *
                                </label>
                                <Select
                                    id="complaint_type_id"
                                    name="complaint_type_id"
                                    options={complaintTypeOptions}
                                    onChange={handleComplaintTypeChange}
                                    value={complaintTypeOptions.find(option => option.value === formik.values.complaint_type_id) || null}
                                    className="basic-select"
                                    classNamePrefix="select"
                                />
                                {formik.errors.complaint_type_id && formik.touched.complaint_type_id && (
                                    <p className="mt-1 text-sm text-red-600">{formik.errors.complaint_type_id}</p>
                                )}
                            </div>

                            {/* Complaint Sub Type */}
                            <div>
                                <label htmlFor="complaint_subtype_id" className="block text-sm font-medium text-gray-700 mb-1">
                                    Complaint Sub Type (Optional)
                                </label>
                                <Select
                                    id="complaint_subtype_id"
                                    name="complaint_subtype_id"
                                    options={complaintSubTypeOptions}
                                    onChange={(selectedOption) => {
                                        formik.setFieldValue('complaint_subtype_id', selectedOption ? selectedOption.value : '');
                                    }}
                                    value={complaintSubTypeOptions.find(option => option.value === formik.values.complaint_subtype_id) || null}
                                    className="basic-select"
                                    classNamePrefix="select"
                                    isDisabled={!selectedComplaintType}
                                />
                            </div>

                            {/* Contact Number */}
                            <div>
                                <label htmlFor="contact_number" className="block text-sm font-medium text-gray-700 mb-1">
                                    Contact Number *
                                </label>
                                <input
                                    id="contact_number"
                                    name="contact_number"
                                    type="tel"
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    value={formik.values.contact_number}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                {formik.errors.contact_number && formik.touched.contact_number && (
                                    <p className="mt-1 text-sm text-red-600">{formik.errors.contact_number}</p>
                                )}
                            </div>

                    {/* Address */}
                    <div className="md:col-span-2">
                        <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                            Address *
                        </label>
                        <textarea
                            id="address"
                            name="address"
                            rows={3}
                            onChange={formik.handleChange}
                            onBlur={formik.handleBlur}
                            value={formik.values.address}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        {formik.errors.address && formik.touched.address && (
                            <p className="mt-1 text-sm text-red-600">{formik.errors.address}</p>
                        )}
                    </div>

                            {/* Description */}
                            <div className="md:col-span-2">
                                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                                    Description of Work *
                                </label>
                                <textarea
                                    id="description"
                                    name="description"
                                    rows={5}
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    value={formik.values.description}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                {formik.errors.description && formik.touched.description && (
                                    <p className="mt-1 text-sm text-red-600">{formik.errors.description}</p>
                                )}
                            </div>

                            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label htmlFor="budget_code" className="block text-sm font-medium text-gray-700 mb-1">Budget Code *</label>
                                    <input
                                        id="budget_code"
                                        name="budget_code"
                                        type="text"
                                        onChange={formik.handleChange}
                                        value={formik.values.budget_code}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                                    />
                                    {formik.errors.budget_code && formik.touched.budget_code && (
                                        <p className="mt-1 text-sm text-red-600">{formik.errors.budget_code}</p>
                                    )}
                                </div>
                                <div>
                                    <label htmlFor="file_type" className="block text-sm font-medium text-gray-700 mb-1">File Type *</label>
                                    <select
                                        id="file_type"
                                        name="file_type"
                                        onChange={formik.handleChange}
                                        value={formik.values.file_type}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                                    >
                                        <option value="">Select file type...</option>
                                        <option value="R&M">Repair & Maintenance (R&M)</option>
                                        <option value="ADP">Annual Development (ADP)</option>
                                    </select>
                                    {formik.errors.file_type && formik.touched.file_type && (
                                        <p className="mt-1 text-sm text-red-600">{formik.errors.file_type}</p>
                                    )}
                                </div>
                            </div>

                            {/* Additional Subtowns */}
                            <div>
                                <label htmlFor="subtown_ids" className="block text-sm font-medium text-gray-700 mb-1">Additional Subtowns (Multi-select)</label>
                                <Select
                                    isMulti
                                    id="subtown_ids"
                                    name="subtown_ids"
                                    options={subtownOptions}
                                    value={subtownOptions.filter(opt => formik.values.subtown_ids.includes(opt.value))}
                                    onChange={selectedOptions => formik.setFieldValue('subtown_ids', selectedOptions ? selectedOptions.map(opt => opt.value) : [])}
                                    className="basic-select"
                                    classNamePrefix="select"
                                    isDisabled={!selectedTown}
                                />
                            </div>
                        </div>

                        <div className="md:col-span-2">
                    <h3 className="text-lg font-medium mb-2">Location Details</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="latitude" className="block text-sm font-medium text-gray-700 mb-1">
                                Latitude
                            </label>
                            <input
                                id="latitude"
                                name="latitude"
                                type="number"
                                step="any"
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                value={formik.values.latitude || ''}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="Enter latitude"
                            />
                        </div>
                        
                        <div>
                            <label htmlFor="longitude" className="block text-sm font-medium text-gray-700 mb-1">
                                Longitude
                            </label>
                            <input
                                id="longitude"
                                name="longitude"
                                type="number"
                                step="any"
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                value={formik.values.longitude || ''}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="Enter longitude"
                            />
                        </div>
                    </div>
                    
                    <div className="mt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={getCurrentLocation}
                            disabled={locationLoading}
                            className="flex items-center gap-2"
                        >
                            {locationLoading ? (
                                <span>Getting Location...</span>
                            ) : (
                                <>
                                    <span>Get Current Location</span>
                                </>
                            )}
                        </Button>
                        {locationAccess && (
                            <p className="mt-2 text-sm text-green-600">Location access granted</p>
                        )}
                    </div>
                </div>
                        <div className="mt-6 flex justify-end">
                            <button
                                type="submit"
                                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                                Submit Request
                            </button>
                        </div>
            </form>
        </div>
    );
};